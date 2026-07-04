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

export function createRoutes(): Hono {
  const routes = new Hono();

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

  return routes;
}
