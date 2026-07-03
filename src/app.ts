/**
 * Main Hono application — middleware chain, routes, WebSocket upgrade.
 */
import { Hono } from "hono";
import { cors } from "hono/cors";
import { serveStatic } from "hono/bun";
import { join } from "node:path";
import { errorHandler } from "./middleware/error-handler";
import { requestLogger } from "./middleware/logger";
import { rateLimiter } from "./middleware/rate-limiter";
import { securityHeaders } from "./middleware/security-headers";
import { authMiddleware, loginPage, loginHandler, logoutHandler } from "./middleware/auth";
import { createRoutes } from "./routes";

const PUBLIC_DIR = join(process.cwd(), "public");

export function createApp(): Hono {
  const app = new Hono();

  // ── Global Middleware ──
  app.use("*", errorHandler);
  app.use("*", requestLogger);
  app.use("*", rateLimiter);
  app.use("*", securityHeaders);
  app.use(
    "*",
    cors({
      origin: ["http://localhost:8000", "http://127.0.0.1:8000"],
      allowMethods: ["GET", "POST", "PUT", "DELETE"],
      allowHeaders: ["Content-Type", "Authorization"],
      credentials: true,
    }),
  );

  // ── Auth routes (no protection) ──
  app.get("/login", loginPage);
  app.post("/login", loginHandler);
  app.post("/logout", logoutHandler);

  // ── Static files (no auth needed) ──
  app.use("/static/*", serveStatic({ root: PUBLIC_DIR }));

  // ── WebSocket upgrade (no auth for WS handshake — auth handled in handler) ──
  // WebSocket is handled in index.ts via Bun.serve's websocket option

  // ── Auth gate — everything below requires valid session ──
  app.use("*", authMiddleware);

  // ── Serve UI ──
  app.get("/", serveStatic({ path: join(PUBLIC_DIR, "index.html") }));
  app.get("/settings", serveStatic({ path: join(PUBLIC_DIR, "settings.html") }));
  app.get("/models", serveStatic({ path: join(PUBLIC_DIR, "models.html") }));
  app.get("/providers", serveStatic({ path: join(PUBLIC_DIR, "providers.html") }));
  app.get("/agents", serveStatic({ path: join(PUBLIC_DIR, "agents.html") }));
  app.get("/worlds", serveStatic({ path: join(PUBLIC_DIR, "worlds.html") }));
  app.get("/graph.html", serveStatic({ path: join(PUBLIC_DIR, "graph.html") }));

  // ── API Routes ──
  const routes = createRoutes();
  app.route("/api", routes);

  return app;
}
