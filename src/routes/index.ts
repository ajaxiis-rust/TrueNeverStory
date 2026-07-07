/**
 * Route aggregator — mounts all route modules.
 */
import { Hono } from "hono";
import { chatRouter } from "./chat";
import { entitiesRouter } from "./entities";
import { memoryRouter } from "./memory";
import { branchesRouter } from "./branches";
import { probabilityRouter } from "./probability";
import { romanceRouter } from "./romance";
import { questsRouter } from "./quests";
import { sessionsRouter } from "./sessions";
import { maintenanceRouter } from "./maintenance";
import { launchRouter } from "./launch";
import { healthRouter } from "./health";
import { settingsRouter } from "./settings";
import { modelsRouter } from "./models";
import { providersRouter } from "./providers";
import { agentsRouter } from "./agents";
import { worldsRouter } from "./worlds";
import { i18nRouter } from "./i18n";
import { systemRouter } from "./system";
import { monitoringRouter } from "./monitoring";
import { rulesRouter } from "./rules";
import { featureFlagsRouter } from "./feature-flags";
import { worldStoreRouter } from "./world-store";
import { v1Router } from "./v1";
import { v2Router } from "./v2";
import crossWorldRoutes from "./cross-world";
import pluginRoutes from "./plugins";

export function createRoutes(): Hono {
  const routes = new Hono();

  // API Versioning
  routes.route("/api/v1", v1Router);
  routes.route("/api/v2", v2Router);

  // Legacy routes (deprecated, use /api/v2)
  routes.use("/api/*", async (c, next) => {
    c.header("X-API-Version", "legacy");
    c.header("Deprecation", "true");
    c.header("Sunset", "2026-12-31");
    await next();
  });

  // Chat (includes /chat/stream SSE)
  routes.route("/chat", chatRouter);

  // Entities & graph
  routes.route("/", entitiesRouter);

  // Memory
  routes.route("/", memoryRouter);

  // Branches
  routes.route("/", branchesRouter);

  // Probability
  routes.route("/", probabilityRouter);

  // Romance
  routes.route("/", romanceRouter);

  // Quests
  routes.route("/", questsRouter);

  // Sessions
  routes.route("/", sessionsRouter);

  // Maintenance
  routes.route("/", maintenanceRouter);

  // Launch
  routes.route("/", launchRouter);

  // Health
  routes.route("/", healthRouter);

  // Settings
  routes.route("/", settingsRouter);

  // Models
  routes.route("/", modelsRouter);

  // Providers (multi-provider LLM support)
  routes.route("/", providersRouter);

  // Agents (per-agent config and prompts)
  routes.route("/", agentsRouter);

  // i18n translations
  routes.route("/", i18nRouter);

  // Worlds (multi-world management)
  routes.route("/", worldsRouter);

  // System (pause/resume)
  routes.route("/", systemRouter);

  // Monitoring dashboard
  routes.route("/", monitoringRouter);

  // Rules Engine (social/economic rules)
  routes.route("/", rulesRouter);

  // Feature Flags (A/B testing, gradual rollout)
  routes.route("/", featureFlagsRouter);

  // World Store (JSON → SQLite migration)
  routes.route("/", worldStoreRouter);

  // Cross-World Communication
  routes.route("/api/cross-world", crossWorldRoutes);

  // Plugin System
  routes.route("/api/plugins", pluginRoutes);

  return routes;
}
