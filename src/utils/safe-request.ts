/**
 * Safe JSON body parsing for Hono request handlers.
 * Logs a warning on parse failure instead of silently returning {}.
 */
import type { Context } from "hono";
import { getLogger } from "./logger";

const log = getLogger("safe-request");

export async function safeJsonBody<T>(c: Context): Promise<T> {
  return (c.req.json() as Promise<T>).catch((e) => {
    log.warn({ err: e, path: c.req.path }, "Failed to parse request body, using {}");
    return {} as T;
  });
}
