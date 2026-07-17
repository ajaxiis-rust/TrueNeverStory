/**
 * TrueNeverStory — Server entry point.
 * Initializes all services via NarrativeService, mounts routes, handles WebSocket.
 */
import { loadConfig, getConfig } from "./config/env";
import { getLogger } from "./utils/logger";
import { createApp } from "./app";
import { isSessionValid } from "./middleware/auth";
import { startSessionCleanup, stopSessionCleanup } from "./lib/session-store";
import { NarrativeService } from "./services/narrative-service";
import { setEngine, setWSManager } from "./routes/chat";
import { setWorldServices } from "./routes/worlds";
import { initEntities } from "./routes/entities";
import { initBranches } from "./routes/branches";
import { initMemory } from "./routes/memory";
import { initSessions } from "./routes/sessions";
import { initLaunch } from "./routes/launch";
import { initSystem } from "./routes/system";
import { WebSocketManager } from "./services/websocket-manager";
import { Navigator } from "./services/navigator";
import { RoleplayEngine } from "./services/roleplay-engine";
import { HeartbeatService } from "./services/heartbeat";
import { TranslationService } from "./services/translation-service";
import { TNSServer, type TNSServerConfig } from "./mcp/server";
import { readJsonFileSync, atomicWriteJson } from "./lib/atomic-io";
import { existsSync, mkdirSync, renameSync } from "node:fs";
import { join } from "node:path";

const log = getLogger("main");

process.on("unhandledRejection", (reason) => {
  log.error({ err: reason }, "Unhandled promise rejection");
});

process.on("uncaughtException", (err) => {
  log.fatal({ err }, "Uncaught exception");
  process.exit(1);
});

async function main() {
  // ── CLI flags ──
  if (process.argv.includes("--version") || process.argv.includes("-v")) {
    // @ts-ignore — TNS_VERSION is injected at compile time via --define
    const v: string = typeof TNS_VERSION !== "undefined" ? TNS_VERSION : "dev";
    console.log(`tns-server ${v}`);
    process.exit(0);
  }

  loadConfig();
  const cfg = getConfig();
  log.info("Configuration loaded");

  // ── World migration & resolution ──
  const worldsRoot = cfg.WORLDS_ROOT;
  const legacyDbPath = cfg.WORLD_DB_PATH;

  if (!existsSync(worldsRoot)) {
    mkdirSync(worldsRoot, { recursive: true });

    // Migrate legacy world_db/ → worlds/default/
    if (existsSync(legacyDbPath) && legacyDbPath !== worldsRoot) {
      const defaultWorldPath = join(worldsRoot, "default");
      log.info({ from: legacyDbPath, to: defaultWorldPath }, "Migrating legacy world_db to worlds/default");
      renameSync(legacyDbPath, defaultWorldPath);
    }
  }

  // Read active world from conf/settings.json
  let activeWorld = "default";
  const confSettingsPath = join(cfg.CONF_PATH, "settings.json");
  if (existsSync(confSettingsPath)) {
    try {
      const settings = readJsonFileSync<{ activeWorld?: string }>(confSettingsPath);
      if (settings?.activeWorld) activeWorld = settings.activeWorld;
    } catch (err) {
      log.warn({ err }, "Failed to read active world setting");
    }
  }

  // Fallback: if active world doesn't exist, use first available
  const activeWorldPath = join(worldsRoot, activeWorld);
  if (!existsSync(activeWorldPath)) {
    const { readdirSync } = await import("node:fs");
    const dirs = readdirSync(worldsRoot, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name);
    activeWorld = dirs[0] ?? "default";
    if (!existsSync(join(worldsRoot, activeWorld))) {
      mkdirSync(join(worldsRoot, activeWorld), { recursive: true });
    }
  }

  const dbPath = join(worldsRoot, activeWorld);
  log.info({ world: activeWorld, path: dbPath }, "Active world resolved");

  // Load world frame
  const worldFramePath = join(dbPath, "world_frame.json");
  let worldFrame: Record<string, unknown> = {};
  if (existsSync(worldFramePath)) {
    worldFrame = readJsonFileSync<Record<string, unknown>>(worldFramePath) ?? {};
  }

  // Initialize NarrativeService (DI container for all services)
  const narrativeCtx = new NarrativeService({ dbPath, worldFrame });
  await narrativeCtx.start();

  // Expose narrative service globally for routes
  (globalThis as any).__narrativeService = narrativeCtx;

  // Set rate limiter on provider manager
  const { getProviderManager } = await import("./lib/providers");
  const providerManager = await getProviderManager();
  providerManager.setRateLimiter(narrativeCtx.providerRateLimiter);

  // WebSocket manager
  const wsManager = new WebSocketManager();
  setWSManager(wsManager);

  // EventBus and Heartbeat Service (v0.25.0 State-First pipeline)
  // Use the same EventBus from NarrativeService so heartbeat events are received
  const eventBus = narrativeCtx.eventBus;
  const heartbeatService = new HeartbeatService(eventBus, wsManager);

  // MCP Server (v0.27.0) — Bible & Gutenberg parsers
  // BibleParser and GutenbergParser use data/bible/ and data/gutenberg/ by default
  const bibleDbPath = join(dbPath, "bible.db");
  const gutenbergDbPath = join(dbPath, "gutenberg.db");
  const dataBiblePath = join(process.cwd(), "data", "bible", "bible-normalized.db");
  const dataGutenbergPath = join(process.cwd(), "data", "gutenberg", "gutenberg-normalized.db");
  let mcpServer: TNSServer | null = null;

  if (existsSync(dataBiblePath) || existsSync(dataGutenbergPath) || existsSync(bibleDbPath) || existsSync(gutenbergDbPath)) {
    const mcpConfig: TNSServerConfig = {
      bibleDbPath,
      gutenbergDbPath,
      entityStore: narrativeCtx.entityStore,
    };
    mcpServer = new TNSServer(mcpConfig);
    await mcpServer.initialize();
    log.info("MCP Server initialized (Bible + Gutenberg parsers)");
  } else {
    log.info("MCP Server skipped (no bible/gutenberg databases found in data/ or worlds/)");
  }

  // Translation Service (v0.25.0) — English as Interlingua
  const translationService = new TranslationService(narrativeCtx.llmQueue);

  // Wire rate limit notifications to WebSocket
  if (narrativeCtx.llmQueue) {
    narrativeCtx.llmQueue.setRateLimitNotification((notification) => {
      wsManager.broadcast({
        type: "rate_limit_notification",
        ...notification,
      });
    });
  }

  // Roleplay engine
  const engine = narrativeCtx.createRoleplayEngine(mcpServer ?? undefined, translationService);
  setEngine(engine);
  setWorldServices(narrativeCtx, engine);

  // Wire up route dependencies
  const nav = new Navigator(narrativeCtx.entityStore);
  initEntities(nav, narrativeCtx.graphStore);
  initBranches(narrativeCtx.graphStore);
  initMemory(wsManager);
  initSessions(narrativeCtx.historyMgr);
  initLaunch(narrativeCtx);
  initSystem(narrativeCtx);

  // Create Hono app
  const app = createApp();

  // Resolve external IP
  const port = cfg.WORLD_SERVER_PORT;
  const host = cfg.WORLD_SERVER_HOST;
  let externalIp = host;
  if (host === "0.0.0.0") {
    try {
      const nets = await import("node:os").then((os) => os.networkInterfaces());
      for (const ifaces of Object.values(nets)) {
        for (const iface of ifaces ?? []) {
          if (iface.family === "IPv4" && !iface.internal) {
            externalIp = iface.address;
            break;
          }
        }
        if (externalIp !== host) break;
      }
    } catch {
      // Network interface lookup failed — use configured host
    }
  }

  log.info(`Starting server on ${host}:${port}`);

  const wsByServer = new Map<{ send: (data: string | ArrayBufferLike) => void }, string>();

  const server = Bun.serve({
    fetch(req, server) {
      let url: URL;
      try {
        url = new URL(req.url);
      } catch {
        return new Response("Bad Request", { status: 400 });
      }

      if (url.pathname.startsWith("/ws")) {
        const cookie = req.headers.get("cookie") ?? "";
        const match = cookie.match(/bring_session=([a-f0-9]+)/);
        const token = match?.[1];
        if ((!token || !isSessionValid(token)) && cfg.AUTH_PASSWORD) {
          return new Response("Unauthorized", { status: 401 });
        }
        const upgraded = server.upgrade(req);
        if (upgraded) return undefined;
        return new Response("Upgrade failed", { status: 500 });
      }

      return app.fetch(req);
    },
    port,
    hostname: host,
    websocket: {
      open(ws) {
        const id = wsManager.add({
          send: (data: string) => ws.send(data),
          close: () => ws.close(),
        });
        wsByServer.set(ws, id);
        log.info({ wsId: id }, "WebSocket connected");
      },
      message(ws, message) {
        handleWSMessage(ws, message, wsManager, engine);
      },
      close(ws) {
        const id = wsByServer.get(ws);
        if (id) wsManager.remove(id);
        wsByServer.delete(ws);
        log.info("WebSocket disconnected");
      },
    },
  });

  log.info(`TrueNeverStory server running at http://${externalIp}:${port}`);
  log.info("Ready to accept connections");

  startSessionCleanup();

  let shuttingDown = false;
  const shutdown = async () => {
    if (shuttingDown) {
      log.warn("Force exit");
      process.exit(1);
    }
    shuttingDown = true;
    log.info("Shutting down...");

    const forceExit = setTimeout(() => {
      log.warn("Shutdown timeout — force exit");
      process.exit(1);
    }, 5000);
    forceExit.unref();

    wsManager.closeAll();
    stopSessionCleanup();
    await narrativeCtx.shutdown();
    server.stop();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

function handleWSMessage(
  ws: { send: (data: string | ArrayBufferLike) => void },
  rawMessage: string | Buffer,
  wsManager: WebSocketManager,
  engine: RoleplayEngine,
): void {
  let data: Record<string, unknown>;
  try {
    data = JSON.parse(typeof rawMessage === "string" ? rawMessage : rawMessage.toString());
  } catch {
    ws.send(JSON.stringify({ type: "error", detail: "Invalid JSON" }));
    return;
  }

  const msgType = (data.type as string) ?? "message";

  if (msgType === "message") {
    const content = (data.content as string)?.trim();
    if (!content) {
      ws.send(JSON.stringify({ type: "error", detail: "Empty message" }));
      return;
    }
    if (data.character) engine.activeCharacter = data.character as string;
    if (data.location) engine.currentLocation = data.location as string;

    engine.processInput(content)
      .then((result) => {
        if (typeof result === "object" && result !== null && "agentResponse" in result) {
          const agentResult = (result as { agentResponse: { response: string; agentId: string; agentName: string } }).agentResponse;
          ws.send(JSON.stringify({
            type: "agent",
            narrative: `【${agentResult.agentName}】\n${agentResult.response}`,
            agent_id: agentResult.agentId,
            agent_name: agentResult.agentName,
            location: engine.currentLocation,
            story_time: engine.currentTime.toISOString(),
            active_character: engine.activeCharacter,
          }));
        } else {
          ws.send(JSON.stringify({
            type: "narrative",
            narrative: result as string,
            location: engine.currentLocation,
            story_time: engine.currentTime.toISOString(),
            active_character: engine.activeCharacter,
          }));
        }
      })
      .catch((err) => {
        ws.send(JSON.stringify({ type: "error", detail: err.message }));
      });
  } else if (msgType === "setup") {
    const storyTime = data.story_time ? new Date(data.story_time as string) : new Date();
    engine.setSession({
      character: data.character as string,
      location: (data.location as string) ?? "unknown",
      storyTime,
      role: (data.role as string) ?? "protagonist",
      sessionId: data.session_id as string,
    });
    ws.send(JSON.stringify({
      type: "session",
      active_character: engine.activeCharacter,
      current_location: engine.currentLocation,
      current_time: engine.currentTime.toISOString(),
    }));
  } else if (msgType === "ping") {
    ws.send(JSON.stringify({ type: "pong" }));
  }
}

main().catch((err) => {
  log.error({ err }, "Failed to start server");
  process.exit(1);
});
