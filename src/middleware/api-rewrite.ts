/**
 * API prefix rewrite middleware.
 * Rewrites /api/* to /* (strips /api prefix).
 */
import type { MiddlewareHandler } from "hono";

export const apiRewrite: MiddlewareHandler = async (c, next) => {
  const path = c.req.path;
  if (path.startsWith("/api")) {
    const newPath = path.slice(4) || "/";
    // Re-create request with new path
    const url = new URL(c.req.url);
    url.pathname = newPath;
    const newReq = new Request(url.toString(), c.req.raw);
    c.req.raw = newReq;
    c.req.path = newPath;
  }
  await next();
};
