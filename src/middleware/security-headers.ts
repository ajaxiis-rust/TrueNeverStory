/**
 * Security headers middleware.
 * Adds common security headers to all responses.
 */
import type { MiddlewareHandler } from "hono";

export const securityHeaders: MiddlewareHandler = async (c, next) => {
  await next();

  // Prevent MIME type sniffing
  c.header("X-Content-Type-Options", "nosniff");

  // Prevent clickjacking
  c.header("X-Frame-Options", "DENY");

  // XSS protection (legacy browsers)
  c.header("X-XSS-Protection", "1; mode=block");

  // Referrer policy
  c.header("Referrer-Policy", "strict-origin-when-cross-origin");

  // Permissions policy (restrict browser features)
  c.header("Permissions-Policy", "camera=(), microphone=(), geolocation=()");

  // Content Security Policy (basic)
  c.header(
    "Content-Security-Policy",
    "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; font-src 'self'; connect-src 'self' ws: wss:; img-src 'self' data:; base-uri 'self'; form-action 'self'",
  );
};
