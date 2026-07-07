/**
 * Main Hono application — middleware chain, routes, WebSocket upgrade.
 */
import { Hono } from "hono";
import { cors } from "hono/cors";
import { join } from "node:path";
import { existsSync, readFileSync } from "node:fs";
import { errorHandler } from "./middleware/error-handler";
import { requestLogger } from "./middleware/logger";
import { rateLimiter } from "./middleware/rate-limiter";
import { securityHeaders } from "./middleware/security-headers";
import { authMiddleware, loginPage, loginHandler, logoutHandler } from "./middleware/auth";
import { createRoutes } from "./routes";

const PUBLIC_DIR = join(process.cwd(), "public");

function serveHtml(filePath: string) {
  const fullPath = join(PUBLIC_DIR, filePath);
  if (!existsSync(fullPath)) {
    return new Response("Not Found", { status: 404 });
  }
  return new Response(readFileSync(fullPath, "utf-8"), {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

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
      origin: process.env.TNS_CORS_ORIGIN || "*",
      allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
      allowHeaders: ["Content-Type", "Authorization"],
      credentials: true,
    }),
  );

  // ── Auth routes (no protection) ──
  app.get("/login", loginPage);
  app.post("/login", loginHandler);
  app.post("/logout", logoutHandler);

  // ── Static assets (no auth needed) ──
  app.get("/static/*", (c) => {
    const assetPath = join(PUBLIC_DIR, c.req.path.replace(/^\//, ""));
    const normalizedPub = PUBLIC_DIR.replace(/\\/g, "/");
    const normalizedAsset = assetPath.replace(/\\/g, "/");
    if (!normalizedAsset.startsWith(normalizedPub + "/") && normalizedAsset !== normalizedPub) {
      return new Response("Forbidden", { status: 403 });
    }
    const file = Bun.file(assetPath);
    if (file.size > 0) {
      return new Response(file);
    }
    return new Response("Not Found", { status: 404 });
  });

  // ── WebSocket upgrade (no auth for WS handshake — auth handled in handler) ──

  // ── Auth gate — everything below requires valid session ──
  app.use("*", authMiddleware);

  // ── Serve UI ──
  app.get("/", (c) => serveHtml("index.html"));
  app.get("/settings", (c) => serveHtml("settings.html"));
  app.get("/models", (c) => serveHtml("models.html"));
  app.get("/providers", (c) => serveHtml("providers.html"));
  app.get("/agents", (c) => serveHtml("agents.html"));
  app.get("/worlds", (c) => serveHtml("worlds.html"));
  app.get("/graph.html", (c) => serveHtml("graph.html"));
  app.get("/dashboard", (c) => serveHtml("dashboard.html"));

  // ── API Routes ──
  const routes = createRoutes();
  app.route("/api", routes);

  return app;
}
