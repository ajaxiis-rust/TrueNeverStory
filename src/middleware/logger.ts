/**
 * Pino request logging middleware.
 */
import type { MiddlewareHandler } from "hono";
import { getLogger } from "../utils/logger";

const log = getLogger("http");

export const requestLogger: MiddlewareHandler = async (c, next) => {
  const start = Date.now();
  await next();
  const ms = Date.now() - start;
  log.info({
    method: c.req.method,
    path: c.req.path,
    status: c.res.status,
    ms,
  });
};
