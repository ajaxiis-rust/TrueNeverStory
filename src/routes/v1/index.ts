/**
 * API v1 — wraps existing routes with version prefix.
 */

import { Hono } from "hono";
import { agentsRouter } from "../agents";
import { worldsRouter } from "../worlds";
import { settingsRouter } from "../settings";

const v1 = new Hono();

v1.route("/", agentsRouter);
v1.route("/", worldsRouter);
v1.route("/", settingsRouter);

export { v1 as v1Router };
