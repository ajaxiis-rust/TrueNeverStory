/**
 * Centralized error handling middleware.
 */
import type { Context, MiddlewareHandler } from "hono";
import { getLogger } from "../utils/logger";

const log = getLogger("error-handler");

export interface AppError extends Error {
  status?: number;
  code?: string;
}

export function createAppError(message: string, status = 500, code?: string): AppError {
  const err = new Error(message) as AppError;
  err.status = status;
  err.code = code;
  return err;
}

export const errorHandler: MiddlewareHandler = async (c, next) => {
  try {
    await next();
  } catch (err: unknown) {
    const error = err as AppError;
    const status = error.status ?? 500;
    const message = status === 500 ? "Internal Server Error" : error.message;

    log.error({ err, status, path: c.req.path }, "Request error");

    return c.json(
      {
        error: message,
        code: error.code ?? "INTERNAL_ERROR",
      },
      status as 400 | 401 | 403 | 404 | 429 | 500,
    );
  }
  return undefined;
};
