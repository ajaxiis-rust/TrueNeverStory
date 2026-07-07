/**
 * Rate limiting middleware (in-memory token bucket with gradual refill).
 */
import type { MiddlewareHandler } from "hono";
import { getClientIp } from "./auth";

interface Bucket {
  tokens: number;
  lastRefill: number;
}

const buckets = new Map<string, Bucket>();
const RATE_LIMIT = 200; // max tokens per bucket
const REFILL_RATE = RATE_LIMIT / 60_000; // tokens per ms (full refill in 60s)
const CLEANUP_INTERVAL = 120_000;
let lastCleanup = Date.now();

export const rateLimiter: MiddlewareHandler = async (c, next) => {
  const ip = getClientIp(c);
  const now = Date.now();

  // Periodic cleanup of stale buckets
  if (now - lastCleanup > CLEANUP_INTERVAL) {
    for (const [key, b] of buckets) {
      if (now - b.lastRefill > CLEANUP_INTERVAL) buckets.delete(key);
    }
    lastCleanup = now;
  }

  let bucket = buckets.get(ip);
  if (!bucket) {
    bucket = { tokens: RATE_LIMIT, lastRefill: now };
    buckets.set(ip, bucket);
  } else {
    // Gradual refill based on elapsed time
    const elapsed = now - bucket.lastRefill;
    const refill = elapsed * REFILL_RATE;
    if (refill > 0) {
      bucket.tokens = Math.min(RATE_LIMIT, bucket.tokens + refill);
      bucket.lastRefill = now;
    }
  }

  if (bucket.tokens < 1) {
    return c.json({ error: "Rate limit exceeded" }, 429);
  }

  bucket.tokens--;
  return next();
};
