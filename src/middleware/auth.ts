/**
 * Password-based authentication middleware.
 * Flow: GET /login → POST /login → session cookie → /api/* protected.
 */
import type { Context, MiddlewareHandler } from "hono";
import { getConfig } from "../config/env";
import { randomBytes, pbkdf2Sync } from "node:crypto";
import { getLogger } from "../utils/logger";
import { loadSettings } from "../services/settings";

const log = getLogger("auth");

const sessions = new Map<string, number>(); // token → createdAt
const SESSION_TTL = 24 * 60 * 60 * 1000; // 24 hours

const PBKDF2_ITERATIONS = 100_000;
const PBKDF2_KEYLEN = 64;
const PBKDF2_DIGEST = "sha512";

/** Get client IP from request headers. */
export function getClientIp(c: Context): string {
  const forwarded = c.req.header("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return c.req.header("x-real-ip") ?? "unknown";
}

/** Get effective password from env (AUTH_PASSWORD) or settings (authPassword). */
function getEffectivePassword(): { value: string; isHash: boolean } {
  const cfg = getConfig();
  const settings = loadSettings();

  // Settings password takes priority (user may have changed it via UI)
  if (settings.authPassword) {
    if (settings.authPassword.includes(":") && settings.authPassword.length > 40) {
      // Looks like pbkdf2 hash (salt:hash)
      return { value: settings.authPassword, isHash: true };
    }
    // Plaintext from settings
    return { value: settings.authPassword, isHash: false };
  }

  // ENV password hash
  if (cfg.AUTH_PASSWORD_HASH) {
    return { value: cfg.AUTH_PASSWORD_HASH, isHash: true };
  }

  // ENV plaintext password
  return { value: cfg.AUTH_PASSWORD, isHash: false };
}

export function hashPassword(password: string, salt?: string): { hash: string; salt: string } {
  const s = salt ?? randomBytes(16).toString("hex");
  const hash = pbkdf2Sync(password, s, PBKDF2_ITERATIONS, PBKDF2_KEYLEN, PBKDF2_DIGEST).toString("hex");
  return { hash, salt: s };
}

function verifyPassword(password: string, storedHash: string, salt: string): boolean {
  const { hash } = hashPassword(password, salt);
  return hash === storedHash;
}

/** Login rate limiting: max attempts per IP */
const loginAttempts = new Map<string, { count: number; resetAt: number }>();
const LOGIN_MAX_ATTEMPTS = 5;
const LOGIN_WINDOW_MS = 60_000; // 1 minute
const LOGIN_LOCKOUT_MS = 300_000; // 5 minutes lockout

function checkLoginRateLimit(ip: string): { allowed: boolean; retryAfter?: number } {
  const now = Date.now();
  const entry = loginAttempts.get(ip);

  if (!entry || now > entry.resetAt) {
    loginAttempts.set(ip, { count: 1, resetAt: now + LOGIN_WINDOW_MS });
    return { allowed: true };
  }

  if (entry.count >= LOGIN_MAX_ATTEMPTS) {
    const retryAfter = Math.ceil((entry.resetAt + LOGIN_LOCKOUT_MS - now) / 1000);
    return { allowed: false, retryAfter: retryAfter > 0 ? retryAfter : 1 };
  }

  entry.count++;
  return { allowed: true };
}

function createSessionToken(): string {
  return randomBytes(32).toString("hex");
}

export function isSessionValid(token: string): boolean {
  const created = sessions.get(token);
  if (!created) return false;
  if (Date.now() - created > SESSION_TTL) {
    sessions.delete(token);
    return false;
  }
  return true;
}

/** Parse cookie header into a Map. */
function parseCookies(header: string | undefined): Map<string, string> {
  const cookies = new Map<string, string>();
  if (!header) return cookies;
  for (const part of header.split(";")) {
    const [key, ...rest] = part.split("=");
    if (key) cookies.set(key.trim(), rest.join("=").trim());
  }
  return cookies;
}

/** Extract session token from request cookies. */
function getSessionToken(c: Context): string | null {
  const cookies = parseCookies(c.req.header("cookie"));
  return cookies.get("bring_session") ?? null;
}

/** Render login HTML page. */
function renderLoginPage(error?: string): string {
  const errorMsg = error ? `<div style="color:var(--accent);font-size:11px;margin-bottom:12px">${error}</div>` : "";
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>TrueNeverStory — Login</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{height:100vh;display:flex;align-items:center;justify-content:center;background:#000;font-family:'Courier New',monospace;color:#ccc}
.login{width:320px;padding:32px;border:1px solid #272727;border-radius:12px;background:#080808}
.title{font-size:10px;text-transform:uppercase;letter-spacing:0.14em;color:#8E8E8E;margin-bottom:24px;text-align:center}
.title span{color:#fff;font-weight:700}
.field{margin-bottom:16px}
.label{font-size:9px;text-transform:uppercase;letter-spacing:0.1em;color:#666;margin-bottom:6px;display:block}
.input{width:100%;background:#111;border:1px solid #272727;border-radius:8px;padding:10px 12px;font-family:inherit;font-size:12px;color:#ccc;outline:none;transition:border-color 120ms}
.input:focus{border-color:#555}
.btn{width:100%;background:#fff;color:#000;border:none;border-radius:999px;padding:10px;font-family:inherit;font-size:9px;text-transform:uppercase;letter-spacing:0.1em;cursor:pointer;transition:opacity 120ms}
.btn:hover{opacity:.9}
.err{color:#D71921;font-size:11px;margin-bottom:12px;text-align:center}
</style>
</head>
<body>
<form class="login" method="POST" action="/login">
  <div class="title"><span>TrueNeverStory</span></div>
  ${errorMsg}
  <div class="field">
    <label class="label">Password</label>
    <input class="input" type="password" name="password" placeholder="Enter password" autofocus required>
  </div>
  <button class="btn" type="submit">Enter</button>
</form>
</body>
</html>`;
}

/** Authentication middleware — protects /api/* routes. */
export const authMiddleware: MiddlewareHandler = async (c, next) => {
  const effective = getEffectivePassword();

  // No password configured → open access
  if (!effective.value) {
    await next();
    return;
  }

  // Allow login page routes without auth
  const path = c.req.path;
  if (path === "/login" || path === "/login/") {
    await next();
    return;
  }

  // Check session token
  const token = getSessionToken(c);
  if (token && isSessionValid(token)) {
    await next();
    return;
  }

  // Unauthenticated → redirect to login (API routes get 401, page routes get redirect)
  if (path.startsWith("/api") || path.startsWith("/ws")) {
    return c.json({ error: "Authentication required", login_url: "/login" }, 401);
  }

  // Browser request → redirect to login
  return c.redirect("/login");
};

/** Login page handler — GET /login. */
export const loginPage: MiddlewareHandler = async (c) => {
  const token = getSessionToken(c);
  if (token && isSessionValid(token)) {
    return c.redirect("/");
  }
  return c.html(renderLoginPage());
};

/** Login form handler — POST /login. */
export const loginHandler: MiddlewareHandler = async (c) => {
  const effective = getEffectivePassword();
  const ip = getClientIp(c);
  const body = await c.req.parseBody();
  const password = body.password as string;

  // Rate limit check
  const rateCheck = checkLoginRateLimit(ip);
  if (!rateCheck.allowed) {
    log.warn({ ip }, "Login rate limit exceeded");
    return c.html(renderLoginPage(`Too many attempts. Try again in ${rateCheck.retryAfter}s`), 429);
  }

  // Password verification
  let valid = false;
  if (password && effective.value) {
    if (effective.isHash) {
      const [salt, storedHash] = effective.value.split(":");
      if (salt && storedHash) {
        valid = verifyPassword(password, storedHash, salt);
      }
    } else {
      // Plaintext comparison (legacy)
      valid = password === effective.value;
    }
  }

  if (!valid) {
    log.warn({ ip }, "Failed login attempt");
    return c.html(renderLoginPage("Invalid password"), 401);
  }

  // Create session
  const token = createSessionToken();
  sessions.set(token, Date.now());

  log.info({ ip }, "Successful login");

  // Set cookie and redirect
  c.header("Set-Cookie", `bring_session=${token}; Path=/; HttpOnly; SameSite=Lax; Secure; Max-Age=${SESSION_TTL / 1000}`);
  return c.redirect("/");
};

/** Logout handler — POST /logout. */
export const logoutHandler: MiddlewareHandler = async (c) => {
  const token = getSessionToken(c);
  if (token) sessions.delete(token);
  c.header("Set-Cookie", "bring_session=; Path=/; HttpOnly; Secure; Max-Age=0");
  return c.redirect("/login");
};
