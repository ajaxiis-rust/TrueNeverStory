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
  const MIME: Record<string, string> = {
    ".css": "text/css; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".html": "text/html; charset=utf-8",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".svg": "image/svg+xml",
    ".ico": "image/x-icon",
    ".woff": "font/woff",
    ".woff2": "font/woff2",
    ".ttf": "font/ttf",
    ".eot": "application/vnd.ms-fontobject",
    ".map": "application/json; charset=utf-8",
    ".wasm": "application/wasm",
  };

  app.get("/static/*", (c) => {
    const assetPath = join(PUBLIC_DIR, c.req.path.replace(/^\//, ""));
    const normalizedPub = PUBLIC_DIR.replace(/\\/g, "/");
    const normalizedAsset = assetPath.replace(/\\/g, "/");
    if (!normalizedAsset.startsWith(normalizedPub + "/") && normalizedAsset !== normalizedPub) {
      return new Response("Forbidden", { status: 403 });
    }
    const file = Bun.file(assetPath);
    if (file.size > 0) {
      const ext = assetPath.substring(assetPath.lastIndexOf(".")).toLowerCase();
      const ct = MIME[ext] || "application/octet-stream";
      return new Response(file, { headers: { "Content-Type": ct } });
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
  app.get("/worlds/:name/config", (c) => serveHtml("world-config.html"));
  app.get("/graph.html", (c) => serveHtml("graph.html"));
  app.get("/dashboard", (c) => serveHtml("dashboard.html"));
  app.get("/theme-builder", (c) => serveHtml("theme-builder.html"));

  // ── API Routes (rate limited) ──
  app.use("/api/*", rateLimiter);
  const routes = createRoutes();
  app.route("/api", routes);

  return app;
}
