/**
 * Rate limiting middleware (simple in-memory token bucket).
 */
import type { MiddlewareHandler } from "hono";

interface Bucket {
  tokens: number;
  lastRefill: number;
}

const buckets = new Map<string, Bucket>();
const RATE_LIMIT = 100; // requests per minute
const REFILL_INTERVAL = 60_000;

export const rateLimiter: MiddlewareHandler = async (c, next) => {
  const ip = c.req.header("x-forwarded-for") ?? "unknown";
  const now = Date.now();

  let bucket = buckets.get(ip);
  if (!bucket || now - bucket.lastRefill > REFILL_INTERVAL) {
    bucket = { tokens: RATE_LIMIT, lastRefill: now };
    buckets.set(ip, bucket);
  }

  if (bucket.tokens <= 0) {
    return c.json({ error: "Rate limit exceeded" }, 429);
  }

  bucket.tokens--;
  return next();
};
