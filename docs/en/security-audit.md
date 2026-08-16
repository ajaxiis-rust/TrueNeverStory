# TrueNeverStory — Security Audit Report

**Date:** 2026-07-04  
**Version:** 0.14.0  
**Scope:** Full codebase security review  

---

## Executive Summary

TNS has a **solid security foundation** for its threat model (local/single-player AI roleplay engine). Authentication, SQL injection protection, prompt injection defense, and input sanitization are well-implemented. The main risks are in edge cases: CSP policy, static file path traversal, WebSocket auth validation, and `Object.assign` prototype pollution patterns. Most issues are medium severity for a local deployment but would be high priority for any public-facing instance.

**Overall rating: MODERATE** — adequate for local use, needs hardening for public deployment.

---

## 1. Authentication & Session Management

### Strengths

| Control | Location | Status |
|---------|----------|--------|
| PBKDF2 password hashing | `src/middleware/auth.ts:16-18` | 100k iterations, SHA-512, 64-byte key |
| Session tokens | `src/middleware/auth.ts:79-81` | `randomBytes(32)` — 256-bit entropy |
| Cookie security | `src/middleware/auth.ts:230` | HttpOnly, SameSite=Lax |
| Login rate limiting | `src/middleware/auth.ts:56-77` | 5 attempts/min, 5-minute lockout |
| Auto-hash on password change | `src/routes/settings.ts:190-196` | PBKDF2 hash generated on PUT |

### Issues

| Severity | Issue | Location | Description |
|----------|-------|----------|-------------|
| **MEDIUM** | In-memory session store | `auth.ts:13` | Sessions lost on server restart. No persistent session storage. Acceptable for single-player local use; problematic for production. |
| **MEDIUM** | Plaintext password fallback | `auth.ts:40-41` | When `AUTH_PASSWORD` env var is set without `AUTH_PASSWORD_HASH`, password is compared as plaintext. Intentional legacy path but weakens security if user doesn't migrate. |
| **LOW** | `x-forwarded-for` spoofable | `auth.ts:193` | IP for rate limiting comes from `x-forwarded-for` header, which can be spoofed without a trusted proxy. Behind a reverse proxy this is fine; direct exposure is spoofable. |

---

## 2. SQL Injection

### Strengths

**All SQLite queries use parameterized placeholders (`?`).** No string interpolation in SQL.

- `src/lib/sqlite-store.ts` — All 30+ queries use `?` placeholders
- FTS5 queries sanitized via `sanitizeFtsQuery()` at line 990: strips non-word characters
- FTS5 MATCH queries built with sanitized tokens joined by `OR`

### Issues

None found. SQL injection is well-handled.

---

## 3. Cross-Site Scripting (XSS)

### Frontend Protection

| Control | Location | Status |
|---------|----------|--------|
| DOMPurify | `public/static/vendor/purify.min.js` | Available for HTML sanitization |
| CSP header | `src/middleware/security-headers.ts:27-28` | Set but weak |

### Issues

| Severity | Issue | Location | Description |
|----------|-------|----------|-------------|
| **HIGH** | CSP allows `unsafe-inline` | `security-headers.ts:27-28` | `script-src 'self' 'unsafe-inline'` allows inline JavaScript execution. An XSS injection would bypass CSP entirely. Should use nonce-based or hash-based CSP. |
| **MEDIUM** | CSP allows `unsafe-inline` for styles | `security-headers.ts:28` | `style-src 'self' 'unsafe-inline'` — CSS injection possible. |
| **LOW** | Login page error message unsanitized | `auth.ts:112` | `renderLoginPage(error)` interpolates error string into HTML without escaping. Error messages are server-generated (not user input), so low risk, but defense-in-depth would require escaping. |

---

## 4. Path Traversal

### Issues

| Severity | Issue | Location | Description |
|----------|-------|----------|-------------|
| **MEDIUM** | Static file serving lacks path validation | `src/app.ts:52` | `join(PUBLIC_DIR, c.req.path.replace(/^\//, ""))` — no check that resolved path stays within PUBLIC_DIR. Hono's `join()` may not prevent `..` traversal on all OS combinations. |
| **MEDIUM** | World file access without path validation | `src/routes/worlds.ts:146,257` | `join(getConfig().WORLDS_ROOT, name)` where `name` comes from URL parameter. If `name` contains `../`, could access files outside worlds directory. |
| **LOW** | Snapshot path uses user-provided session_id | `src/routes/launch.ts:118` | `join(snapshotDir, \`${sessionId}.json\`)` — sessionId from request body. If it contains `../`, could read arbitrary `.json` files. |
| **LOW** | Chapter file access | `src/routes/worlds.ts:253-264` | `join(getConfig().WORLDS_ROOT, name, "chapters", filename)` — filename from URL param, no sanitization. |

---

## 5. Command Injection

### Strengths

| Control | Location | Status |
|---------|----------|--------|
| Backend install whitelist | `src/routes/models.ts:58` | `name` validated against `["ollama", "llamacpp"]` before use in path |
| Safe expression evaluator | `src/services/probability-expression.ts` | Recursive descent parser instead of `eval()`/`new Function()` |

### Issues

| Severity | Issue | Location | Description |
|----------|-------|----------|-------------|
| **LOW** | `execSync` for install scripts | `src/routes/models.ts:71` | `execSync(\`bash "${scriptPath}"\`)` — scriptPath is constructed from whitelisted name + fixed directory, so not directly exploitable. But the pattern is fragile if the whitelist is ever expanded. |
| **LOW** | `spawn` for llama-server | `src/routes/settings.ts:132` | Args come from `loadLLMConfig()` (config file), not user input. Safe, but config file is writable via API. |

### No Unsafe Patterns Found

- No `eval()` usage in production code (only in tests for `safeEval` verification)
- No `new Function()` usage
- `exec` imported in `model-manager.ts:8` but grep found no actual `exec()` calls — only `execSync` in routes/models.ts
- `child_process` usage is limited to specific, controlled contexts

---

## 6. Prototype Pollution

### Issues

| Severity | Issue | Location | Description |
|----------|-------|----------|-------------|
| **LOW** | `Object.assign` with user-influenced data | Multiple files | Used in `entity-store.ts:206-208`, `quest-manager.ts:78`, `entity-extractor.ts:62`, `provider-manager.ts:283`. If input objects contain `__proto__` keys, prototype pollution is possible. Most usage is with internal data, but `provider-manager.ts:283` merges config updates. |

---

## 7. WebSocket Security

### Issues

| Severity | Issue | Location | Description |
|----------|-------|----------|-------------|
| **MEDIUM** | WS auth only checks cookie presence | `src/index.ts:151-153` | `cookie.includes("bring_session=")` — checks if cookie exists, not if the token is valid. An expired/invalid token still allows WebSocket upgrade. |
| **LOW** | No input sanitization on WS messages | `src/index.ts:229` | WS message content goes directly to `engine.processInput()` without `sanitizeInput()`. REST routes (`/chat/message`) do sanitize; WS does not. |

---

## 8. Input Validation

### Strengths

| Control | Location | Status |
|---------|----------|--------|
| Zod schema validation | `src/routes/chat.ts:35,61` | `zValidator("json", ChatMessageSchema)` on chat endpoints |
| Prompt injection sanitization | `src/utils/sanitize.ts` | 15+ regex patterns, max length 8000 chars |
| User content wrapping | `src/utils/sanitize.ts:81-83` | `<user_message>` markers separate user content from system prompt |

### Issues

| Severity | Issue | Location | Description |
|----------|-------|----------|-------------|
| **LOW** | Missing validation on most routes | `src/routes/*.ts` | Most API endpoints use `c.req.json().catch(() => ({}))` without schema validation. Only chat routes use Zod. |
| **LOW** | No type validation on world creation | `src/routes/worlds.ts:67` | `body.name` used without length/format validation. |

---

## 9. Error Handling

### Strengths

| Control | Location | Status |
|---------|----------|--------|
| Generic 500 messages | `src/middleware/error-handler.ts:27` | `"Internal Server Error"` — no stack traces leaked |
| API key masking | `src/routes/settings.ts:164-168` | GET settings masks `llmApiKey`, `embeddingApiKey`, `authPassword` |

### Issues

| Severity | Issue | Location | Description |
|----------|-------|----------|-------------|
| **LOW** | Error messages in some routes leak details | `src/routes/chat.ts:103`, `src/routes/worlds.ts:83,97,110,136` | `err.message` returned in JSON response. May expose internal paths or stack info in some error types. |

---

## 10. Dependency & Configuration Security

### Strengths

| Control | Location | Status |
|---------|----------|--------|
| `.env` gitignored | `.gitignore:4` | Excludes `.env` and `.env.*` |
| Config files gitignored | `.gitignore:16-19` | `conf/settings.json`, `conf/providers.json`, `conf/llm-config.json`, `conf/agents.json` |
| World data gitignored | `.gitignore:20-31` | All world databases, session history, profiles excluded |

### Issues

| Severity | Issue | Location | Description |
|----------|-------|----------|-------------|
| **LOW** | Hardcoded model directories | `src/routes/settings.ts:101` | `findModel()` searches `/home/opc/prj/HIBRING/local-models` and `/home/opc/koboldcpp/models` — hardcoded paths, not configurable. |

---

## 11. CORS Configuration

| Severity | Issue | Location | Description |
|----------|-------|----------|-------------|
| **MEDIUM** | CORS hardcoded to localhost | `src/app.ts:38` | `origin: ["http://localhost:8000", "http://127.0.0.1:8000"]` — no configurable CORS. Production deployments behind reverse proxy need manual update to support external origins. |

---

## 12. Security Headers

All present and correct:

| Header | Value | Status |
|--------|-------|--------|
| X-Content-Type-Options | `nosniff` | Correct |
| X-Frame-Options | `DENY` | Correct |
| X-XSS-Protection | `1; mode=block` | Correct (legacy browsers) |
| Referrer-Policy | `strict-origin-when-cross-origin` | Correct |
| Permissions-Policy | `camera=(), microphone=(), geolocation=()` | Correct |
| Content-Security-Policy | See §3 above | Present but weak (`unsafe-inline`) |

Missing headers (recommended):
- `Strict-Transport-Security` (HSTS) — only relevant for HTTPS
- `X-Permitted-Cross-Domain-Policies: none`
- `Cross-Origin-Opener-Policy: same-origin`
- `Cross-Origin-Resource-Policy: same-origin`

---

## 13. Prompt Injection Defense

### Strengths

| Control | Location | Status |
|---------|----------|--------|
| Pattern-based sanitization | `src/utils/sanitize.ts:6-34` | 15+ regex patterns covering: instruction override, system prompt injection, role hijacking, output manipulation, DAN-style jailbreaks, markdown/code injection |
| Content wrapping | `src/utils/sanitize.ts:81-83` | `<user_message>` markers |
| Max message length | `src/utils/sanitize.ts:36` | 8000 characters |
| Applied on REST routes | `src/routes/chat.ts:66,129,165` | All chat endpoints sanitize |
| Safe expression evaluator | `src/services/probability-expression.ts:202` | Blocks `import`, `require`, `eval`, `Function`, `this`, `global`, `process`, `window`, `document` |

### Issues

| Severity | Issue | Location | Description |
|----------|-------|----------|-------------|
| **MEDIUM** | WebSocket messages not sanitized | `src/index.ts:229` | `engine.processInput(content)` without `sanitizeInput()`. REST routes do sanitize. |

---

## Recommendations (Priority Order)

1. **Fix CSP** — Replace `unsafe-inline` with nonce-based or hash-based CSP. This is the highest-impact security improvement.
2. **Validate WebSocket messages** — Apply `sanitizeInput()` to WS message content before passing to engine.
3. **Validate WS session tokens** — Check token validity against session store, not just cookie presence.
4. **Add path traversal checks** — For static files, verify `resolvedPath.startsWith(PUBLIC_DIR)`. For world routes, validate `name` parameter against allowed characters.
5. **Add `Strict-Transport-Security`** when deploying with HTTPS.
6. **Remove hardcoded paths** in `settings.ts:101` — make model directories configurable.
7. **Add input validation** to routes that accept JSON bodies without Zod schemas.
8. **Consider persistent sessions** — SQLite-backed sessions would survive restarts.

---

## Files Reviewed

| File | Purpose |
|------|---------|
| `src/middleware/auth.ts` | Authentication, sessions, login rate limiting |
| `src/middleware/rate-limiter.ts` | IP-based rate limiting |
| `src/middleware/security-headers.ts` | HTTP security headers |
| `src/middleware/error-handler.ts` | Centralized error handling |
| `src/app.ts` | Hono app, CORS, static serving, auth gate |
| `src/index.ts` | Server entry point, WebSocket handling |
| `src/lib/sqlite-store.ts` | SQLite with parameterized queries, FTS5 |
| `src/utils/sanitize.ts` | Prompt injection sanitization |
| `src/services/probability-expression.ts` | Safe expression evaluator |
| `src/services/websocket-manager.ts` | WebSocket connection management |
| `src/services/model-manager.ts` | Model management, Ollama integration |
| `src/routes/chat.ts` | Chat endpoints with Zod validation |
| `src/routes/settings.ts` | Settings CRUD, server management |
| `src/routes/models.ts` | Model/backend management |
| `src/routes/entities.ts` | Entity graph queries |
| `src/routes/worlds.ts` | World CRUD, chapter generation |
| `src/routes/launch.ts` | Game launch, snapshots |
| `src/routes/maintenance.ts` | Memory maintenance |
| `scripts/hash-password.ts` | Password hash utility |
| `.env.example` | Environment configuration |
| `.gitignore` | Git exclusion rules |
